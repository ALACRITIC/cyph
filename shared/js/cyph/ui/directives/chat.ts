import {Enterpress} from 'enterpress';
import {Filechange} from 'filechange';
import {Templates} from 'templates';


/**
 * Angular namespace with directives for chat UI components.
 */
export class Chat {
	/** Module title + namespace for included directives. */
	public static title: string	= 'cyphChat';

	private static _	= (() => {
		angular.
			module(Chat.title, [
				'ngMaterial',
				Enterpress.title,
				Filechange.title
			]).
			directive(Chat.title + 'Cyphertext', () => ({
				restrict: 'A',
				scope: {
					$this: '='
				},
				link: scope => scope['Cyph'] = self['Cyph'],
				template: Templates.chatCyphertext
			})).
			directive(Chat.title + 'Main', () => ({
				restrict: 'A',
				transclude: true,
				scope: {
					$this: '='
				},
				link: scope => scope['Cyph'] = self['Cyph'],
				template: Templates.chatMain
			})).
			directive(Chat.title + 'MessageBox', () => ({
				restrict: 'A',
				scope: {
					$this: '='
				},
				link: scope => scope['Cyph'] = self['Cyph'],
				template: Templates.chatMessageBox
			})).
			directive(Chat.title + 'Sidebar', () => ({
				restrict: 'A',
				scope: {
					$this: '=',
					showChat: '=showChat'
				},
				link: scope => scope['Cyph'] = self['Cyph'],
				template: Templates.chatSidebar
			})).
			directive(Chat.title + 'Toolbar', () => ({
				restrict: 'A',
				scope: {
					$this: '=',
					open: '&open',
					showChat: '=showChat'
				},
				link: scope => scope['Cyph'] = self['Cyph'],
				template: Templates.chatToolbar
			})).
			factory('chatSidenav', [
				'$mdSidenav',

				$mdSidenav => () => $mdSidenav('sidenav')
			])
		;
	})();
}
