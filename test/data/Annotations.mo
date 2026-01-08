within;
model Annotations
  replaceable package Medium = Buildings.Media.Water
    constrainedby Modelica.Media.Interfaces.PartialMedium
    "Medium model for all four fluid circuits"
    annotation(choices(
      choice(redeclare package Medium=Buildings.Media.Water "Water"),
      choice(redeclare replaceable package Medium=
        Buildings.Media.Antifreeze.PropyleneGlycolWater(property_T=293.15,
          X_a=0.40)
        "Propylene glycol water, 40% mass fraction")));
  // Plants with AWHP.
  parameter Buildings.Templates.Plants.HeatPumps.Types.Distribution typDis_select1(
    start=Buildings.Templates.Plants.HeatPumps.Types.Distribution.Constant1Variable2) =
    Buildings.Templates.Plants.HeatPumps.Types.Distribution.Constant1Variable2
    "Type of distribution system"
    annotation(Evaluate=true,
      Dialog(group="Configuration",
        enable=typ == Buildings.Templates.Components.Types.HeatPump.AirToWater),
      choices(
        choice=Buildings.Templates.Plants.HeatPumps.Types.Distribution.Variable1Only
          "Variable primary-only",
        choice=Buildings.Templates.Plants.HeatPumps.Types.Distribution.Constant1Variable2
          "Constant primary - Variable secondary centralized"));
  parameter Boolean is_dpBalYPumSetCal(start=false) = false
    "Set to true to automatically size balancing valves or evaluate pump speed providing design flow"
    annotation(Evaluate=true,
      Dialog(tab="Advanced",
        enable=typDis ==
          Buildings.Templates.Plants.HeatPumps.Types.Distribution.Constant1Variable2));
  replaceable Buildings.Templates.AirHandlersFans.Components.OutdoorSection.SingleDamper secOut
    constrainedby Buildings.Templates.AirHandlersFans.Components.Interfaces.PartialOutdoorSection (
      redeclare final package MediumAir=MediumAir,
      final energyDynamics=energyDynamics,
      final allowFlowReversal=allowFlowReversal,
      final dat=dat,
      final have_recHea=have_recHea,
      final typCtlEco=typCtlEco)
    "Outdoor air section"
    annotation(choices(
      choice(redeclare OutdoorSection.SingleDamper secOut
        "Single damper for ventilation and economizer, with airflow measurement station"),
      choice(redeclare replaceable Buildings.Templates.AirHandlersFans.Components.OutdoorSection.DedicatedDampersAirflow secOut
        "Separate dampers for ventilation and economizer, with airflow measurement station"),
      choice(redeclare replaceable Buildings.Templates.AirHandlersFans.Components.OutdoorSection.DedicatedDampersPressure secOut
        "Separate dampers for ventilation and economizer, with differential pressure sensor")),
      Dialog(group="Configuration"),
      Placement(transformation(extent={{-58,-94},{-22,-66}})));
  Buildings.Templates.Components.Interfaces.Bus bus
    if typ <> Buildings.Templates.Components.Types.Valve.None
    "Control bus"
    annotation(Placement(transformation(extent={{-20,-20},{20,20}},
      rotation=0,
      origin={0,160}),
      iconTransformation(extent={{-10,-10},{10,10}},
        rotation=0,
        origin={0,100})));
equation
  connect(TChiWatPriSup.port_b, tanChiWatSup.port_a)
    annotation(Line(points={{70,80},{120,80}},
      color={0,0,0},
      thickness=0.5,
      visible=have_chiWat));
  connect(tanChiWatSup.port_b, junChiWatBypSup.port_1)
    annotation(Line(points={{140,80},{170,80}},
      color={0,0,0},
      thickness=0.5,
      visible=have_chiWat));
  connect(junChiWatBypRet.port_2, tanChiWatRet.port_a)
    annotation(Line(points={{170,0},{140,0}},
      color={0,0,0},
      thickness=0.5,
      visible=have_chiWat,
      pattern=LinePattern.Dash));
annotation(__Dymola_Commands(
  file="modelica://Buildings/Resources/Scripts/Dymola/Templates/Plants/Controls/Enabling/Validation/Enable.mos"
    "Simulate and plot"),
  defaultComponentName="lat",
  Icon(coordinateSystem(preserveAspectRatio=true,
    extent={{-100,-100},{100,100}}),
    graphics={Bitmap(visible=typFanRet ==
      Buildings.Templates.Components.Types.Fan.SingleVariable,
      extent={{540,500},{340,700}},
      fileName="modelica://Buildings/Resources/Images/Templates/Components/Fans/Housed.svg"),
    Rectangle(extent={{-100,100},{100,-100}},
      fillColor={210,210,210},
      fillPattern=FillPattern.Solid,
      borderPattern=BorderPattern.Raised),
    Ellipse(extent={{-73,9},{-87,-5}},
      lineColor=DynamicSelect({235,235,235},
        if u then {0,255,0} else {235,235,235}),
      fillColor=DynamicSelect({235,235,235},
        if u then {0,255,0} else {235,235,235}),
      fillPattern=FillPattern.Solid),
    Ellipse(extent={{81,7},{95,-7}},
      lineColor=DynamicSelect({235,235,235},
        if y then {0,255,0} else {235,235,235}),
      fillColor=DynamicSelect({235,235,235},
        if y then {0,255,0} else {235,235,235}),
      fillPattern=FillPattern.Solid),
    Ellipse(extent={{-73,-53},{-87,-67}},
      lineColor=DynamicSelect({235,235,235},
        if clr then {0,255,0} else {235,235,235}),
      fillColor=DynamicSelect({235,235,235},
        if clr then {0,255,0} else {235,235,235}),
      fillPattern=FillPattern.Solid),
    Line(points={{-68,-62},{4,-62},{4,-22},{74,-22}},
      color={255,0,255}),
    Line(points={{-68,24},{-48,24},{-48,56},{-16,56},{-16,24},{24,24},{24,56},{54,56},{54,24},{74,24}},
      color={255,0,255}),
    Text(extent={{-14,-8},{14,-18}},
      textColor={0,0,0},
      fillColor={210,210,210},
      fillPattern=FillPattern.Solid,
      textString="Clear"),
    Text(extent={{-16,72},{24,58}},
      textColor={0,0,0},
      fillColor={210,210,210},
      fillPattern=FillPattern.Solid,
      textString="Latch input"),
    Text(extent={{-150,150},{150,110}},
      textColor={0,0,255},
      textString="%name")}),
  Documentation(
    info="<html>
<p>
  Block that generates a <code>true</code> output when the latch input
  <code>u</code> rises from <code>false</code> to
  <code>true</code>, provided that the clear input <code>clr</code>
  is <code>false</code> or also became at the same time
  <code>false</code>. The output remains <code>true</code> until the
  clear input <code>clr</code> rises from <code>false</code> to
  <code>true</code> .
</p>
<p>
  If the clear input <code>clr</code> is <code>true</code>, the
  output <code>y</code> switches to <code>false</code> (if it was
  <code>true</code>) and it remains <code>false</code>, regardless of
  the value of the latch input <code>u</code>.
</p>
<p>
  At initial time, if <code>clr = false</code>, then the output will be
  <code>y = u</code>. Otherwise it will be <code>y=false</code> (because
  the clear input <code>clr</code> is <code>true</code>).
</p>
<p align=\"center\">
  <img
    src=\"modelica://Buildings/Resources/Images/Controls/OBC/CDL/Logical/Latch.png\"
    alt=\"Latch.png\"
  />
</p>
</html>
",
    revisions="<html>
<ul>
  <li>
    November 3, 2025, by Michael Wetter:
    <br />
    Reformulated initialization to enable translation of system model with
    this block in OpenModelica.
    <br />
    This is for
    <a href=\"https://github.com/ibpsa/modelica-ibpsa/issues/2064\">
      IBPSA, issue 2064</a>.
  </li>
  <li>
    April 15, 2024, by Antoine Gautier:
    <br />
    Simplified the implementation.
    <br />
    This is for
    <a href=\"https://github.com/lbl-srg/modelica-buildings/issues/3796\">Buildings,
      issue 3796</a>.
  </li>
  <li>
    October 13, 2020, by Jianjun Hu:
    <br />
    Removed the parameter <code>pre_y_start</code>, and made the initial output
    to be equal to latch input when the clear input is <code>false</code>.
    <br />
    This is for
    <a href=\"https://github.com/lbl-srg/modelica-buildings/issues/2177\">Buildings,
      issue 2177</a>.
  </li>
  <li>
    March 9, 2020, by Michael Wetter:
    <br />
    Simplified implementation, and made model work with OpenModelica.
  </li>
  <li>
    April 4, 2019, by Jianjun Hu:
    <br />
    Corrected implementation that causes wrong output at initial stage. This
    is for
    <a href=\"https://github.com/lbl-srg/modelica-buildings/issues/1402\">Buildings,
      issue 1402</a>.
  </li>
  <li>
    December 1, 2017, by Michael Wetter:
    <br />
    Revised documentation.
  </li>
  <li>
    March 30, 2017, by Jianjun Hu:
    <br />
    First implementation.
  </li>
</ul>
</html>
"));
end Annotations;
