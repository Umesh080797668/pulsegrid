import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App, appProviders } from './app/app';

bootstrapApplication(App, { ...appConfig, providers: [...(appConfig.providers || []), ...appProviders] })
  .catch((err) => console.error(err));
