import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkspaceDetail } from './workspace-detail';

describe('WorkspaceDetail', () => {
  let component: WorkspaceDetail;
  let fixture: ComponentFixture<WorkspaceDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkspaceDetail],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkspaceDetail);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
