import {Env} from '../env';
import {EventManager} from '../eventmanager';
import {Elements} from './elements';


/**
 * Keeps track of this window's visibility to user.
 */
export class VisibilityWatcher {
	/** @ignore */
	private static readonly visibilityChangeEvent: string	= 'visibilityChangeEvent';

	/** Indicates whether the window is currently visible. */
	public static isVisible: boolean	= true;

	/** @ignore */
	private static trigger (isVisible: boolean) : void {
		VisibilityWatcher.isVisible	= isVisible;
		EventManager.trigger(VisibilityWatcher.visibilityChangeEvent, VisibilityWatcher.isVisible);
	}

	/**
	 * Sets handler to run when visibility changes.
	 * @param handler
	 */
	public static onchange<T> (handler: (data: T) => void) : void {
		EventManager.on(VisibilityWatcher.visibilityChangeEvent, handler);
	}

	/** @ignore */
	/* tslint:disable-next-line:member-ordering */
	public static readonly _	= (() => {
		if (Env.isMobile) {
			document.addEventListener('visibilitychange', () =>
				VisibilityWatcher.trigger(!document.hidden)
			);
		}
		else {
			Elements.window().
				focus(() => VisibilityWatcher.trigger(true)).
				blur(() => VisibilityWatcher.trigger(false))
			;
		}
	})();
}
