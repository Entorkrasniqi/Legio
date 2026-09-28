import { Menu, type MenuItemConstructorOptions } from 'electron';
import { APP_NAME } from '../shared/constants';

/**
 * Minimal native menu for M1: standard roles plus Settings… (⌘,). The full
 * menu with ⌘N / ⌘K / ⌘⇧A arrives with the features they open (M10 polish
 * per docs/ROADMAP.md).
 */
export function installAppMenu(openSettings: () => void): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about', label: `About ${APP_NAME}` },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CommandOrControl+,', click: openSettings },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: `Hide ${APP_NAME}` },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: `Quit ${APP_NAME}` },
      ],
    },
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
