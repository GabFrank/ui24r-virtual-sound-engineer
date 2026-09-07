import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { ShellComponent } from './app/shell/shell.component';

bootstrapApplication(ShellComponent, appConfig).catch((err) => {
  console.error('fallo al arrancar la aplicación', err);
});
