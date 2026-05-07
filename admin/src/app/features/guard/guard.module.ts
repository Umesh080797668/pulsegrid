import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GuardPageComponent } from './guard-page/guard-page';
import { GuardAlertCardComponent } from './guard-alert-card/guard-alert-card';
import { GuardFiltersComponent } from './guard-filters/guard-filters';

@NgModule({
  imports: [CommonModule, GuardPageComponent, GuardAlertCardComponent, GuardFiltersComponent],
  exports: [GuardPageComponent],
})
export class GuardModule {}