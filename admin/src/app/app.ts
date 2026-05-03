import { Component, signal, importProvidersFrom } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { MaterialModule } from './shared/material/material-module';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('PulseGrid Enterprise Admin');
}

export const appProviders = [importProvidersFrom(MaterialModule), provideAnimations()];
