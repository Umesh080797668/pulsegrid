package com.pulsegrid.enterprise.reporting;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import net.sf.jasperreports.engine.JRException;
import net.sf.jasperreports.engine.JasperCompileManager;
import net.sf.jasperreports.engine.JasperExportManager;
import net.sf.jasperreports.engine.JasperFillManager;
import net.sf.jasperreports.engine.JasperPrint;
import net.sf.jasperreports.engine.JasperReport;
import net.sf.jasperreports.engine.data.JRBeanCollectionDataSource;
import org.springframework.stereotype.Service;

@Service
public class ReportService {

	public byte[] generatePdf(String title, List<ReportLine> lines) {
		try {
			JasperReport report = JasperCompileManager.compileReport(
				new ByteArrayInputStream(template().getBytes(StandardCharsets.UTF_8)));
			JasperPrint print = JasperFillManager.fillReport(
				report,
				Map.of("REPORT_TITLE", title),
				new JRBeanCollectionDataSource(lines));
			return JasperExportManager.exportReportToPdf(print);
		} catch (JRException exception) {
			throw new IllegalStateException("Unable to generate JasperReports PDF", exception);
		}
	}

	private String template() {
		return """
			<?xml version="1.0" encoding="UTF-8"?>
			<jasperReport xmlns="http://jasperreports.sourceforge.net/jasperreports"
				xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
				xsi:schemaLocation="http://jasperreports.sourceforge.net/jasperreports http://jasperreports.sourceforge.net/xsd/jasperreport.xsd"
				name="enterprise-report" pageWidth="595" pageHeight="842" columnWidth="515" leftMargin="40" rightMargin="40" topMargin="40" bottomMargin="40" uuid="d3f8f4c0-2e4d-4c3c-9edb-b7269a912345">
				<parameter name="REPORT_TITLE" class="java.lang.String"/>
				<field name="label" class="java.lang.String"/>
				<field name="value" class="java.lang.String"/>
				<title>
					<band height="40">
						<textField>
							<reportElement x="0" y="0" width="515" height="30"/>
							<textElement>
								<font size="18" isBold="true"/>
							</textElement>
							<textFieldExpression><![CDATA[$P{REPORT_TITLE}]]></textFieldExpression>
						</textField>
					</band>
				</title>
				<detail>
					<band height="24">
						<textField>
							<reportElement x="0" y="0" width="220" height="18"/>
							<textFieldExpression><![CDATA[$F{label}]]></textFieldExpression>
						</textField>
						<textField>
							<reportElement x="240" y="0" width="275" height="18"/>
							<textFieldExpression><![CDATA[$F{value}]]></textFieldExpression>
						</textField>
					</band>
				</detail>
			</jasperReport>
			""";
	}

	public record ReportLine(String label, String value) {
	}
}
