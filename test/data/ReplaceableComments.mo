within;
model ReplaceableComments
  replaceable package MediumChiWat = Buildings.Media.Water
    constrainedby Modelica.Media.Interfaces.PartialMedium
    "CHW medium"
    annotation(Dialog(enable=have_chiWat),
      __ctrlFlow(enable=false));
  /*
   * Derived classes representing AWHP shall use:
   * redeclare final package MediumSou = MediumAir
   */
  replaceable package MediumSou = Buildings.Media.Water
    constrainedby Modelica.Media.Interfaces.PartialMedium
    "Source-side medium"
    annotation(Dialog(
      enable=typ == Buildings.Templates.Components.Types.HeatPump.WaterToWater),
      __ctrlFlow(enable=false));
  replaceable package MediumAir = Buildings.Media.Air
    constrainedby Modelica.Media.Interfaces.PartialMedium
    "Air medium"
    annotation(Dialog(
      enable=typ == Buildings.Templates.Components.Types.HeatPump.AirToWater),
      __ctrlFlow(enable=false));
  // The current implementation only supports plants that provide HHW.
end ReplaceableComments;
