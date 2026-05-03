import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JasperReports } from './jasper-reports';

describe('JasperReports', () => {
  let component: JasperReports;
  let fixture: ComponentFixture<JasperReports>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JasperReports],
    }).compileComponents();

    fixture = TestBed.createComponent(JasperReports);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
