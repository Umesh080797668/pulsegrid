import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConnectorList } from './connector-list';

describe('ConnectorList', () => {
  let component: ConnectorList;
  let fixture: ComponentFixture<ConnectorList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConnectorList],
    }).compileComponents();

    fixture = TestBed.createComponent(ConnectorList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
