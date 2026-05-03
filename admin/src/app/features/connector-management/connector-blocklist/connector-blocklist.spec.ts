import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConnectorBlocklist } from './connector-blocklist';

describe('ConnectorBlocklist', () => {
  let component: ConnectorBlocklist;
  let fixture: ComponentFixture<ConnectorBlocklist>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConnectorBlocklist],
    }).compileComponents();

    fixture = TestBed.createComponent(ConnectorBlocklist);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
