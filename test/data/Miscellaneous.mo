within;
model Miscellaneous
  extends Buildings.Fluid.HeatPumps.ModularReversible.BaseClasses.PartialReversibleRefrigerantMachine(
    final use_busConOnl=true,
    final use_COP=have_switchover,
    final use_EER=true,
    final use_rev=false,
    final PEle_nominal=refCyc.refCycChiCoo.PEle_nominal,
    dpEva_nominal=datCoo.dpEva_nominal * scaFacCoo ^ 2,
    dpCon_nominal=datCoo.dpCon_nominal * scaFacCoo ^ 2,
    safCtr(
      redeclare Buildings.Fluid.Chillers.ModularReversible.Controls.Safety.OperationalEnvelope opeEnv),
    redeclare replaceable Buildings.Fluid.HeatPumps.ModularReversible.Controls.Safety.Data.TableData2DLoadDep safCtrPar
      constrainedby Buildings.Fluid.HeatPumps.ModularReversible.Controls.Safety.Data.Generic(
        final use_maxCycRat=false,
        final tabUppHea=[0, 0],
        final tabLowCoo=datCoo.tabLowBou,
        final use_TConOutCoo=datCoo.use_TConOutForOpeEnv,
        final use_TEvaOutCoo=datCoo.use_TEvaOutForOpeEnv),
    dTEva_nominal=abs(QCoo_flow_nominal) / cpEva / mEva_flow_nominal,
    dTCon_nominal=(abs(QCoo_flow_nominal) + PEle_nominal) / cpCon /
      mCon_flow_nominal,
    GEvaIns=0,
    GEvaOut=0,
    CEva=0,
    use_evaCap=false,
    GConIns=0,
    GConOut=0,
    CCon=0,
    use_conCap=false,
    mEva_flow_nominal=datCoo.mEva_flow_nominal * scaFacCoo,
    mCon_flow_nominal=datCoo.mCon_flow_nominal * scaFacCoo,
    redeclare final Buildings.Fluid.Chillers.ModularReversible.BaseClasses.RefrigerantCycleHeatRecovery refCyc(
      redeclare final model RefrigerantCycleChillerCooling=
        RefrigerantCycleChillerCooling));
  final model RefrigerantCycleChillerCooling =
    Buildings.Fluid.Chillers.ModularReversible.RefrigerantCycle.TableData2DLoadDep(
      final useInChi=true,
      redeclare final Buildings.Fluid.HeatPumps.ModularReversible.RefrigerantCycle.Frosting.NoFrosting iceFacCal,
      redeclare model RefrigerantCycleInertia=
        Buildings.Fluid.HeatPumps.ModularReversible.RefrigerantCycle.Inertias.VariableOrder(
          refIneFreConst=1 / 300,
          nthOrd=1,
          initType=Modelica.Blocks.Types.Init.InitialState),
      final dat=datCoo,
      final P_min=P_min)
    "Refrigerant cycle module for the cooling mode"
    annotation(choicesAllMatching=true,
      Placement(transformation(extent={{114,-18},{130,-2}})));
  Buildings.Templates.Plants.Controls.Utilities.PlaceholderInteger phReqPlaHeaWatAirHan(
    each final max=1,
    each final min=0,
    each final unit="1",
    final have_inp=cfg.have_heaWat,
    final u_internal=0)
    "Placeholder value if signal is not available"
    annotation(Placement(transformation(extent={{170,190},{150,210}})));
  Buildings.Templates.Plants.Controls.Utilities.PlaceholderInteger phReqPlaChiWatAirHan(
    final have_inp=cfg.have_chiWat,
    final u_internal=0)
    "Placeholder value if signal is not available"
    annotation(Placement(transformation(extent={{170,150},{150,170}})));
  final parameter Modelica.Units.SI.HeatFlowRate QChg_flow_nominal =
    eps_nominal * min(
      {mLiq_flow_nominal * cpLiq_nominal,
        mAir_flow_nominal * cpTestAirChg_nominal}) * (TLiqEntChg_nominal -
        TAirEntChg_nominal);
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
    "Transmitted heat flow rate at design conditions";
  Buildings.Controls.OBC.CDL.Interfaces.BooleanInput u1PumHeaWatPri_actual[nEnaHeaWat +
    nEnaHeaWat](each start=false)
    if have_heaWat and not (have_valInlIso or have_valOutIso);
equation
  y = if initial() then yIni else u;
end Miscellaneous;
