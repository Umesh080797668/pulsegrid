import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './user-form.html',
  styleUrl: './user-form.scss',
})
export class UserForm {
  form;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<UserForm>,
    @Inject(MAT_DIALOG_DATA) public data: { user: any }
  ) {
    this.form = this.fb.group({
      name: [this.data.user?.name || this.data.user?.fullName || '', [Validators.required, Validators.maxLength(120)]],
      email: [this.data.user?.email || '', [Validators.required, Validators.email]],
      roles: [(this.data.user?.roles || []).join(', ')],
    });
  }

  save() {
    if (this.form.invalid) return;

    const value = this.form.value;
    this.dialogRef.close({
      name: value.name,
      email: value.email,
      roles: (value.roles || '')
        .split(',')
        .map((r: string) => r.trim())
        .filter(Boolean),
    });
  }

  cancel() {
    this.dialogRef.close(null);
  }
}
