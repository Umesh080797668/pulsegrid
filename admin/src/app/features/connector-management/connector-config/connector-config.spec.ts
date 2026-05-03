import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConnectorConfig } from './connector-config';

describe('ConnectorConfig', () => {
  let component: ConnectorConfig;
  let fixture: ComponentFixture<ConnectorConfig>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConnectorConfig],
    }).compileComponents();

    fixture = TestBed.createComponent(ConnectorConfig);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
