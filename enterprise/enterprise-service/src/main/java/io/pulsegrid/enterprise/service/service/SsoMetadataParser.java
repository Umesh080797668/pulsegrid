package io.pulsegrid.enterprise.service.service;

import io.pulsegrid.enterprise.service.model.IdpMetadataDetails;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import javax.xml.xpath.XPathConstants;
import javax.xml.xpath.XPathFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

@Slf4j
@Component
public class SsoMetadataParser {

    public IdpMetadataDetails parse(String metadataXml) {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setExpandEntityReferences(false);
            factory.setXIncludeAware(false);

            Document document = factory.newDocumentBuilder().parse(new InputSource(new StringReader(metadataXml)));
            Element root = document.getDocumentElement();

            String entityId = root.getAttribute("entityID");
            String singleSignOnLocation = firstAttribute(document, "//*[local-name()='SingleSignOnService']", "Location");
            String singleLogoutLocation = firstAttribute(document, "//*[local-name()='SingleLogoutService']", "Location");
            List<X509Certificate> certificates = readCertificates(document);

            return new IdpMetadataDetails(entityId, singleSignOnLocation, singleLogoutLocation, certificates);
        } catch (Exception ex) {
            throw new IllegalArgumentException("Invalid SSO metadata XML", ex);
        }
    }

    public String requireEntityId(String metadataXml) {
        IdpMetadataDetails details = parse(metadataXml);
        if (details.entityId() == null || details.entityId().isBlank()) {
            throw new IllegalArgumentException("IdP metadata does not contain an entityID");
        }
        return details.entityId();
    }

    private String firstAttribute(Document document, String xpathExpression, String attributeName) {
        try {
            var xpath = XPathFactory.newInstance().newXPath();
            NodeList nodes = (NodeList) xpath.evaluate(xpathExpression, document, XPathConstants.NODESET);
            if (nodes.getLength() == 0) {
                return null;
            }
            Element element = (Element) nodes.item(0);
            String value = element.getAttribute(attributeName);
            return value == null || value.isBlank() ? null : value;
        } catch (Exception ex) {
            log.debug("Unable to evaluate metadata xpath {}", xpathExpression, ex);
            return null;
        }
    }

    private List<X509Certificate> readCertificates(Document document) throws Exception {
        NodeList nodes = (NodeList) XPathFactory.newInstance().newXPath()
                .evaluate("//*[local-name()='X509Certificate']", document, XPathConstants.NODESET);
        List<X509Certificate> certificates = new ArrayList<>();
        CertificateFactory certificateFactory = CertificateFactory.getInstance("X.509");
        for (int i = 0; i < nodes.getLength(); i++) {
            String base64 = nodes.item(i).getTextContent().replaceAll("\\s+", "");
            if (base64.isBlank()) {
                continue;
            }
            byte[] decoded = Base64.getDecoder().decode(base64.getBytes(StandardCharsets.UTF_8));
            certificates.add((X509Certificate) certificateFactory.generateCertificate(new java.io.ByteArrayInputStream(decoded)));
        }
        return certificates;
    }
}
