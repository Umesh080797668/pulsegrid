import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Api } from './api';

@Injectable({
  providedIn: 'root',
})
export class UserManagement {
  constructor(private api: Api, private http: HttpClient) {}

  /**
   * Get all users with pagination
   */
  getUsers(page = 0, pageSize = 10): Observable<any> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('size', pageSize.toString());
    return this.api.get('/users', params);
  }

  /**
   * Get user by ID
   */
  getUserById(userId: string): Observable<any> {
    return this.api.get(`/users/${userId}`);
  }

  /**
   * Create new user
   */
  createUser(user: any): Observable<any> {
    return this.api.post('/users', user);
  }

  /**
   * Update user
   */
  updateUser(userId: string, user: any): Observable<any> {
    return this.api.put(`/users/${userId}`, user);
  }

  /**
   * Delete user
   */
  deleteUser(userId: string): Observable<any> {
    return this.api.delete(`/users/${userId}`);
  }

  /**
   * Get all roles
   */
  getRoles(): Observable<any> {
    return this.api.get('/roles');
  }

  /**
   * Assign role to user
   */
  assignRole(userId: string, roleId: string): Observable<any> {
    return this.api.post(`/users/${userId}/roles`, { roleId });
  }

  /**
   * Create role
   */
  createRole(role: any): Observable<any> {
    return this.api.post('/roles', role);
  }

  /**
   * Update role
   */
  updateRole(roleId: string, role: any): Observable<any> {
    return this.api.put(`/roles/${roleId}`, role);
  }

  /**
   * Delete role
   */
  deleteRole(roleId: string): Observable<any> {
    return this.api.delete(`/roles/${roleId}`);
  }
}
