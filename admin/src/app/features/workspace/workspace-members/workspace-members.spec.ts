import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkspaceMembers } from './workspace-members';

describe('WorkspaceMembers', () => {
  let component: WorkspaceMembers;
  let fixture: ComponentFixture<WorkspaceMembers>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkspaceMembers],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkspaceMembers);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
