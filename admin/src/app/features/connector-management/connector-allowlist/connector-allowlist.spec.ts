import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConnectorAllowlist } from './connector-allowlist';

describe('ConnectorAllowlist', () => {
  let component: ConnectorAllowlist;
  let fixture: ComponentFixture<ConnectorAllowlist>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConnectorAllowlist],
    }).compileComponents();

    fixture = TestBed.createComponent(ConnectorAllowlist);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
