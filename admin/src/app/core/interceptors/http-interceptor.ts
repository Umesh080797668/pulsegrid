import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth';

export const httpInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  // Add Authorization token if available
  const token = authService.getToken();
  if (token) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  // Set content type
  req = req.clone({
    setHeaders: {
      'Content-Type': 'application/json',
    },
  });

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Handle different error types
      if (error.status === 401) {
        authService.logout();
      }
      return throwError(() => error);
    })
  );
};
