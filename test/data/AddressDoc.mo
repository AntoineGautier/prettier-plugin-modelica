model AddressDoc
  "Valid HTML that the plugin corrupts via <address>"
  Real y;
equation
  y = time;
annotation(Documentation(
  info="<html>
<address>
  Author: Some One<br />
  Some Company<br />
</address>
<p>First paragraph.</p>
<p>A link
<a href=\"https://example.org\">Example</a> follows.</p>
</html>"));
end AddressDoc;
