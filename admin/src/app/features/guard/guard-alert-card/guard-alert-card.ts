import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { GuardAlert } from '../../../core/store/app.state';

@Component({
  selector: 'app-guard-alert-card',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatChipsModule, MatIconModule],
  templateUrl: './guard-alert-card.html',
  styleUrl: './guard-alert-card.scss',
})
export class GuardAlertCardComponent {
  @Input({ required: true }) alert!: GuardAlert;
  @Input() selected = false;

  @Output() select = new EventEmitter<string>();
  @Output() acknowledge = new EventEmitter<string>();
  @Output() resolve = new EventEmitter<string>();
  @Output() dismiss = new EventEmitter<string>();
  @Output() createGithubIssue = new EventEmitter<string>();

  severityClass(severity: string | undefined): string {
    return `severity-${String(severity || 'error').toLowerCase()}`;
  }

  emitSelect(): void {
    this.select.emit(this.alert.id);
  }

  onAcknowledge(event: MouseEvent): void {
    event.stopPropagation();
    this.acknowledge.emit(this.alert.id);
  }

  onResolve(event: MouseEvent): void {
    event.stopPropagation();
    this.resolve.emit(this.alert.id);
  }

  onDismiss(event: MouseEvent): void {
    event.stopPropagation();
    this.dismiss.emit(this.alert.id);
  }

  onCreateGithubIssue(event: MouseEvent): void {
    event.stopPropagation();
    this.createGithubIssue.emit(this.alert.id);
  }
}