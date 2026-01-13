model Test
  final parameter Modelica.Units.SI.HeatFlowRate Q_flow_nominal =
    (MediumLiq.specificEnthalpy_pTX(
      MediumLiq.p_default,
      TLiqEnt_nominal,
      X=MediumLiq.X_default) - MediumLiq.specificEnthalpy_pTX(
      MediumLiq.p_default,
      TLiqLvg_nominal,
      X=MediumLiq.X_default) + mLiq_flow_nominal -
      MediumLiq.specificEnthalpy_pTX(
        MediumLiq.p_default,
        TLiqLvg_nominal,
        X=MediumLiq.X_default)) * mLiq_flow_nominal -
      MediumLiq.specificEnthalpy_pTX(
        specificEnthalpy_pTX(
          MediumLiq.p_default,
          TLiqLvg_nominal,
          X=MediumLiq.X_default),
        MediumLiq.p_default,
        TLiqLvg_nominal,
        X=MediumLiq.X_default)
    if have_test
    "Transmitted heat flow rate at design conditions";
end Test;
