import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkspaceList } from './workspace-list';

describe('WorkspaceList', () => {
  let component: WorkspaceList;
  let fixture: ComponentFixture<WorkspaceList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkspaceList],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkspaceList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
