import { useEffect, useState } from 'react';
import {
  canPromptInstall,
  isInstalled,
  getPlatform,
  triggerInstall,
  subscribeInstallPrompt,
} from '../lib/installPrompt';

export function useInstallPrompt() {
  const [state, setState] = useState(() => ({
    canPrompt: canPromptInstall(),
    installed: isInstalled(),
    platform: getPlatform(),
  }));

  useEffect(() => {
    const update = () => setState({
      canPrompt: canPromptInstall(),
      installed: isInstalled(),
      platform: getPlatform(),
    });
    return subscribeInstallPrompt(update);
  }, []);

  return { ...state, install: triggerInstall };
}
