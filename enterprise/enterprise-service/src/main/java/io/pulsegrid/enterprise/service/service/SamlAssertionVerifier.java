package io.pulsegrid.enterprise.service.service;

import io.pulsegrid.enterprise.service.model.ValidatedSamlAssertion;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.xml.XMLConstants;
import javax.xml.crypto.dsig.XMLSignature;
import javax.xml.crypto.dsig.XMLSignatureFactory;
import javax.xml.crypto.dsig.dom.DOMValidateContext;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

@Slf4j
@Component
public class SamlAssertionVerifier {

    public ValidatedSamlAssertion verify(String assertionXml, List<X509Certificate> trustedCertificates) {
        try {
            Document document = parseXml(assertionXml);
            Element assertion = (Element) document.getElementsByTagNameNS("urn:oasis:names:tc:SAML:2.0:assertion", "Assertion").item(0);
            if (assertion == null) {
                throw new IllegalArgumentException("SAML assertion XML does not contain an Assertion element");
            }

            Element signatureElement = (Element) document.getElementsByTagNameNS(XMLSignature.XMLNS, "Signature").item(0);
            if (signatureElement == null) {
                throw new IllegalArgumentException("SAML assertion is not signed");
            }

            boolean verified = false;
            for (X509Certificate certificate : trustedCertificates) {
                DOMValidateContext validateContext = new DOMValidateContext(certificate.getPublicKey(), signatureElement);
                setIdAttributeIfPresent(assertion, validateContext);
                XMLSignatureFactory factory = XMLSignatureFactory.getInstance("DOM");
                XMLSignature signature = factory.unmarshalXMLSignature(validateContext);
                if (signature.validate(validateContext)) {
                    verified = true;
                    break;
                }
            }

            if (!verified) {
                throw new IllegalArgumentException("SAML assertion signature could not be verified");
            }

            String subject = readSubject(assertion);
            Map<String, List<String>> attributes = readAttributes(assertion);
            return new ValidatedSamlAssertion(subject, attributes);
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("Unable to verify SAML assertion", ex);
        }
    }

    private Document parseXml(String xml) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setExpandEntityReferences(false);
        factory.setXIncludeAware(false);
        return factory.newDocumentBuilder().parse(new InputSource(new StringReader(xml)));
    }

    private void setIdAttributeIfPresent(Element assertion, DOMValidateContext validateContext) {
        if (assertion.hasAttribute("ID")) {
            assertion.setIdAttribute("ID", true);
            validateContext.setIdAttributeNS(assertion, null, "ID");
        } else if (assertion.hasAttribute("Id")) {
            assertion.setIdAttribute("Id", true);
            validateContext.setIdAttributeNS(assertion, null, "Id");
        }
    }

    private String readSubject(Element assertion) {
        NodeList subjects = assertion.getElementsByTagNameNS("urn:oasis:names:tc:SAML:2.0:assertion", "NameID");
        if (subjects.getLength() == 0) {
            return null;
        }
        return subjects.item(0).getTextContent();
    }

    private Map<String, List<String>> readAttributes(Element assertion) {
        Map<String, List<String>> attributes = new LinkedHashMap<>();
        NodeList attributeNodes = assertion.getElementsByTagNameNS("urn:oasis:names:tc:SAML:2.0:assertion", "Attribute");
        for (int i = 0; i < attributeNodes.getLength(); i++) {
            Node node = attributeNodes.item(i);
            if (!(node instanceof Element attribute)) {
                continue;
            }
            String name = attribute.getAttribute("Name");
            if (name == null || name.isBlank()) {
                continue;
            }
            NodeList values = attribute.getElementsByTagNameNS("urn:oasis:names:tc:SAML:2.0:assertion", "AttributeValue");
            List<String> collected = new ArrayList<>();
            for (int j = 0; j < values.getLength(); j++) {
                String value = values.item(j).getTextContent();
                if (value != null && !value.isBlank()) {
                    collected.add(value.trim());
                }
            }
            attributes.put(name, collected);
        }
        return Collections.unmodifiableMap(attributes);
    }
}
