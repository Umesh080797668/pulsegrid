import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-role-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './role-form.html',
  styleUrl: './role-form.scss',
})
export class RoleForm {
  form;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<RoleForm>,
    @Inject(MAT_DIALOG_DATA) public data: { role: any }
  ) {
    this.form = this.fb.group({
      name: [this.data.role?.name || '', [Validators.required, Validators.maxLength(80)]],
      description: [this.data.role?.description || '', [Validators.maxLength(300)]],
    });
  }

  save() {
    if (this.form.invalid) return;
    this.dialogRef.close(this.form.value);
  }

  cancel() {
    this.dialogRef.close(null);
  }
}
