import { useEffect } from 'react';
import { APP_NAME } from '../../shared/constants';
import { HomeView } from './home/HomeView';
import { SettingsView } from './settings/SettingsView';

/**
 * Each window loads the same bundle; the URL hash picks the view. Main sets
 * it when creating the window, so there's no in-app router to navigate.
 */
export function App() {
  const view = window.location.hash === '#settings' ? 'settings' : 'main';

  useEffect(() => {
    document.title = view === 'settings' ? 'Settings' : APP_NAME;
  }, [view]);

  return view === 'settings' ? <SettingsView /> : <HomeView />;
}
