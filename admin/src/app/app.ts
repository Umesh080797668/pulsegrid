import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="brand-kicker">PulseGrid</p>
          <a class="brand" routerLink="/admin/sso">{{ title() }}</a>
        </div>
        <nav class="nav">
          <a routerLink="/admin/sso" routerLinkActive="active">SSO</a>
        </nav>
      </header>

      <main class="page">
        <router-outlet />
      </main>
    </div>
  `,
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('PulseGrid Enterprise Admin');
}
