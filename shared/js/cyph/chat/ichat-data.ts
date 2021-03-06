import {Subject} from 'rxjs';
import {IChatMessage} from '../../proto';
import {IAsyncList} from '../iasync-list';
import {IAsyncValue} from '../iasync-value';
import {States} from './enums';


/**
 * Represents data in a chat.
 */
export interface IChatData {
	/** The current message being composed. */
	currentMessage: string;

	/** Indicates whether authentication has completed (still true even after disconnect). */
	isConnected: boolean;

	/** Indicates whether chat has been disconnected. */
	isDisconnected: boolean;

	/** Indicates whether the other party is typing. */
	isFriendTyping: Subject<boolean>;

	/** Indicates whether the current message changed before the last check. */
	isMessageChanged: boolean;

	/** Percentage complete with initial handshake (approximate / faked out). */
	keyExchangeProgress: number;

	/** Message list. */
	messages: IAsyncList<IChatMessage>;

	/** The previous message sent. */
	previousMessage?: string;

	/** Currently queued message for sending post-handshake. */
	queuedMessage?: string;

	/** Indicates whether the queued message is self-destructing. */
	queuedMessageSelfDestruct: boolean;

	/** Chat UI state/view. */
	state: States;

	/** IDs of outgoing messages whose receipt has yet to be confirmed. */
	unconfirmedMessages: IAsyncValue<{[id: string]: boolean|undefined}>;
}
