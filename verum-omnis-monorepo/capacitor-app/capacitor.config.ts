import { CapacitorConfig } from '@capacitor/cli';

const APP_START_URL = process.env.APP_START_URL || 'https://YOUR_HOSTNAME'; // e.g. https://verumglobal.foundation

const config: CapacitorConfig = {
  appId: 'foundation.verumglobal.app',
  appName: 'Verum Omnis',
  webDir: 'www',
  server: {
    url: APP_START_URL,
    cleartext: false
  },
  android: {
    allowMixedContent: false
  }
};

export default config;
