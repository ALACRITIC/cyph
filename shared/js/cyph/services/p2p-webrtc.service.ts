import {Injectable} from '@angular/core';
import * as msgpack from 'msgpack-lite';
import * as SimpleWebRTC from 'simplewebrtc';
import {ISessionCommand} from '../../proto';
import {env} from '../env';
import {eventManager} from '../event-manager';
import {IP2PHandlers} from '../p2p/ip2p-handlers';
import {IP2PWebRTCService} from '../service-interfaces/ip2p-webrtc.service';
import {events, ISessionMessageData, rpcEvents} from '../session';
import {util} from '../util';
import {AnalyticsService} from './analytics.service';
import {SessionCapabilitiesService} from './session-capabilities.service';
import {SessionInitService} from './session-init.service';
import {SessionService} from './session.service';


/** @inheritDoc */
@Injectable()
export class P2PWebRTCService implements IP2PWebRTCService {
	/** Indicates whether WebRTC is supported in the current environment. */
	private static readonly isSupported: boolean	=
		/* Temporarily blocking Edge until issue resolved in simplewebrtc/webrtc-adapter */
		!(env.isProd && env.isEdge) &&
		(() => {
			try {
				return new SimpleWebRTC({
					connection: {on: () => {}}
				}).capabilities.support;
			}
			catch (_) {
				return false;
			}
		})()
	;

	/** Constant values used by P2P. */
	public static readonly constants	= {
		accept: 'accept',
		decline: 'decline',
		kill: 'kill',
		requestCall: 'requestCall',
		webRTC: 'webRTC'
	};


	/** @ignore */
	private readonly commands	= {
		accept: () : void => {
			this.join();
		},

		decline: async () : Promise<void> => {
			this.isAccepted	= false;

			(await this.handlers).requestRejection();
		},

		kill: async () : Promise<void> => {
			const wasAccepted: boolean	= this.isAccepted;
			this.isAccepted				= false;
			this.isActive				= false;

			await util.sleep(500);

			this.incomingStream.audio	= false;
			this.incomingStream.video	= false;
			this.outgoingStream.audio	= false;
			this.outgoingStream.video	= false;

			if (this.webRTC && this.webRTC.mute) {
				this.webRTC.mute();
				this.webRTC.pauseVideo();
				this.webRTC.stopLocalVideo();
				this.webRTC.leaveRoom();
				this.webRTC.disconnect();
				this.webRTC	= undefined;
			}

			if (wasAccepted) {
				(await this.handlers).connected(false);
			}
		},

		webRTC: (data: {args: any[]; event: string}) : void => {
			eventManager.trigger(
				P2PWebRTCService.constants.webRTC + data.event,
				data.args
			);
		}
	};

	/** @ignore */
	private readonly handlers: Promise<IP2PHandlers>	=
		new Promise<IP2PHandlers>(resolve => {
			this.resolveHandlers	= resolve;
		})
	;

	/** @ignore */
	private isAccepted: boolean;

	/** @ignore */
	private readonly localVideo: Promise<() => JQuery>	=
		new Promise<() => JQuery>(resolve => {
			this.resolveLocalVideo	= resolve;
		})
	;

	/** @ignore */
	private readonly remoteVideo: Promise<() => JQuery>	=
		new Promise<() => JQuery>(resolve => {
			this.resolveRemoteVideo	= resolve;
		})
	;

	/** @ignore */
	private resolveHandlers: (handlers: IP2PHandlers) => void;

	/** @ignore */
	private resolveLocalVideo: (localVideo: () => JQuery) => void;

	/** @ignore */
	private resolveRemoteVideo: (remoteVideo: () => JQuery) => void;

	/** @ignore */
	private webRTC: any;

	/** @inheritDoc */
	public readonly incomingStream	= {audio: false, video: false};

	/** @inheritDoc */
	public isActive: boolean		= this.sessionInitService.callType !== undefined;

	/** @inheritDoc */
	public loading: boolean;

	/** @inheritDoc */
	public readonly outgoingStream	= {audio: false, video: false};

	/** @ignore */
	private async receiveCommand (command: ISessionCommand) : Promise<void> {
		if (!P2PWebRTCService.isSupported) {
			return;
		}

		const method: Function|undefined	= (<any> this.commands)[command.method];

		if (this.isAccepted && method) {
			method(
				command.argument && command.argument.length > 0 ?
					msgpack.decode(command.argument) :
					undefined
			);
		}
		else if (command.method === 'audio' || command.method === 'video') {
			const ok	= await (await this.handlers).acceptConfirm(
				command.method,
				500000,
				this.isAccepted
			);

			this.sessionService.send([rpcEvents.p2p, {command: {
				method: ok ?
					P2PWebRTCService.constants.accept :
					P2PWebRTCService.constants.decline
			}}]);

			if (!ok) {
				return;
			}

			this.accept(
				command.method === 'audio' ?
					'audio' :
					command.method === 'video' ?
						'video' :
						undefined
			);

			this.join();

			this.analyticsService.sendEvent({
				eventAction: 'start',
				eventCategory: 'call',
				eventLabel: command.method,
				eventValue: 1,
				hitType: 'event'
			});
		}
	}

	/** @ignore */
	private refresh (webRTC: any = this.webRTC) : void {
		this.loading	=
			this.incomingStream.audio ||
			this.incomingStream.video
		;

		if (!webRTC) {
			return;
		}

		webRTC.leaveRoom();
		webRTC.stopLocalVideo();
		webRTC.startLocalVideo();
	}

	/** @inheritDoc */
	public accept (callType?: 'audio'|'video') : void {
		this.isAccepted				= true;
		this.loading				= true;
		this.outgoingStream.video	= callType === 'video';
		this.outgoingStream.audio	= true;
	}

	/** @inheritDoc */
	public close () : void {
		this.sessionService.send([
			rpcEvents.p2p,
			{command: {method: P2PWebRTCService.constants.kill}}
		]);

		this.commands.kill();
	}

	/** @inheritDoc */
	public init (
		handlers: IP2PHandlers,
		localVideo: () => JQuery,
		remoteVideo: () => JQuery
	) : void {
		this.resolveHandlers(handlers);
		this.resolveLocalVideo(localVideo);
		this.resolveRemoteVideo(remoteVideo);
	}

	/** @inheritDoc */
	public async join () : Promise<void> {
		if (this.webRTC) {
			return;
		}

		this.webRTC		= {};

		this.loading	= true;

		this.incomingStream.audio	= this.outgoingStream.audio;
		this.incomingStream.video	= this.outgoingStream.video;

		this.isActive	= true;

		let initialRefresh	= true;

		const iceServers: string	= await util.request({
			retries: 5,
			url: env.baseUrl + 'iceservers'
		});

		const webRTCEvents: string[]	= [];

		const $localVideo	= await util.waitForIterable<JQuery>(await this.localVideo);
		const $remoteVideo	= await util.waitForIterable<JQuery>(await this.remoteVideo);

		const webRTC	= new SimpleWebRTC({
			adjustPeerVolume: true,
			autoRemoveVideos: false,
			autoRequestMedia: false,
			connection: {
				disconnect: () => {
					for (const event of webRTCEvents) {
						eventManager.off(event);
					}
				},
				emit: (event: string, ...args: any[]) => {
					const lastArg: any	= args.slice(-1)[0];

					if (event === 'join' && typeof lastArg === 'function') {
						lastArg(undefined, {clients: {friend: {video: true}}});
					}
					else {
						this.sessionService.send([rpcEvents.p2p, {command: {
							argument: msgpack.encode({args, event}),
							method: P2PWebRTCService.constants.webRTC
						}}]);
					}
				},
				getSessionid: () => this.sessionService.state.cyphID,
				on: (event: string, callback: Function) => {
					const fullEvent: string	= P2PWebRTCService.constants.webRTC + event;
					webRTCEvents.push(fullEvent);

					eventManager.on(
						fullEvent,
						(args: any) => {
							/* http://www.kapejod.org/en/2014/05/28/ */
							if (event === 'message' && args[0].type === 'offer') {
								args[0].payload.sdp	= (<string> args[0].payload.sdp).
									split('\n').
									filter(s => s.indexOf('ssrc-audio-level') < 0).
									join('\n')
								;
							}

							callback.apply(webRTC, args);
						}
					);
				}
			},
			localVideoEl: $localVideo[0],
			media: this.outgoingStream,
			remoteVideosEl: $remoteVideo[0]
		});

		webRTC.webrtc.config.peerConnectionConfig.iceServers	=
			util.parse<any>(iceServers).
			filter((o: any) =>
				!this.sessionService.apiFlags.forceTURN || o.url.indexOf('stun:') !== 0
			)
		;

		webRTC.connection.on(
			'streamUpdate',
			(incomingStream: {audio: boolean; video: boolean}) => {
				this.incomingStream.audio	= !!incomingStream.audio;
				this.incomingStream.video	= !!incomingStream.video;
				this.refresh(webRTC);
			}
		);

		webRTC.on('videoAdded', () => {
			$remoteVideo.find('video').slice(0, -1).remove();

			this.loading	= false;
		});

		webRTC.on('readyToCall', async () => {
			webRTC.joinRoom(P2PWebRTCService.constants.webRTC);

			/* Possible edge case workaround */
			if (initialRefresh) {
				initialRefresh	= false;
				await util.sleep();
				this.refresh();
			}
		});

		webRTC.startLocalVideo();
		webRTC.connection.emit('connect');

		this.webRTC	= webRTC;
	}

	/** @inheritDoc */
	public async request (callType: 'audio'|'video') : Promise<void> {
		const ok	= await (await this.handlers).requestConfirm(callType, this.isAccepted);

		if (!ok) {
			return;
		}

		await this.sessionService.lock(
			async reason => {
				if (reason === P2PWebRTCService.constants.requestCall) {
					return;
				}

				this.accept(callType);

				this.sessionService.send([rpcEvents.p2p, {command: {method: callType}}]);

				await util.sleep();
				(await this.handlers).requestConfirmation();
			},
			P2PWebRTCService.constants.requestCall
		);

		/* Time out if request hasn't been accepted within 10 minutes */

		for (let seconds = 0 ; seconds < 600 ; ++seconds) {
			if (this.isActive) {
				return;
			}

			await util.sleep(1000);
		}

		this.isAccepted	= false;
	}

	/** @inheritDoc */
	public async toggle (shouldPause?: boolean, medium?: 'audio'|'video') : Promise<void> {
		while (!(this.webRTC && this.webRTC.connection)) {
			await util.sleep();
		}

		if (shouldPause !== true && shouldPause !== false) {
			if (medium) {
				(<any> this.outgoingStream)[medium]	= !(<any> this.outgoingStream)[medium];
			}
			else {
				this.outgoingStream.audio	= !this.outgoingStream.audio;
				this.outgoingStream.video	= !this.outgoingStream.video;
			}
		}
		else if (medium) {
			(<any> this.outgoingStream)[medium]	= !shouldPause;
		}
		else {
			this.outgoingStream.audio	= !shouldPause;
			this.outgoingStream.video	= !shouldPause;
		}

		this.webRTC.connection.emit('streamUpdate', this.outgoingStream);
		this.refresh();
	}

	constructor (
		sessionCapabilitiesService: SessionCapabilitiesService,

		/** @ignore */
		private readonly analyticsService: AnalyticsService,

		/** @ignore */
		private readonly sessionInitService: SessionInitService,

		/** @ignore */
		private readonly sessionService: SessionService
	) {
		this.sessionService.on(events.closeChat, () => { this.close(); });

		this.sessionService.on(rpcEvents.p2p, (o: ISessionMessageData) => {
			if (o.command && o.command.method) {
				this.receiveCommand(o.command);
			}
		});

		sessionCapabilitiesService.resolveP2PSupport(P2PWebRTCService.isSupported);
	}
}
