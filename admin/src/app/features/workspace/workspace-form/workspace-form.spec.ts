import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkspaceForm } from './workspace-form';

describe('WorkspaceForm', () => {
  let component: WorkspaceForm;
  let fixture: ComponentFixture<WorkspaceForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkspaceForm],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkspaceForm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
