import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private tokenSubject = new BehaviorSubject<string | null>(
    this.getStoredToken()
  );

  constructor() {}

  /**
   * Get stored token from localStorage
   */
  getToken(): string | null {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('auth_token');
    }
    return null;
  }

  /**
   * Get stored token (alternative method)
   */
  private getStoredToken(): string | null {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('auth_token');
    }
    return null;
  }

  /**
   * Set authentication token
   */
  setToken(token: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('auth_token', token);
      this.tokenSubject.next(token);
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  /**
   * Logout user
   */
  logout(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_info');
    }
    this.tokenSubject.next(null);
  }

  /**
   * Get token as Observable
   */
  getToken$(): Observable<string | null> {
    return this.tokenSubject.asObservable();
  }
}
