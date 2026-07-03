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
  import TypDisSys = Buildings.DHC.Types.DistrictSystemType
    "District system type enumeration"
    annotation(Dialog(enable=false),
      evaluate=true);

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
      MediumLiq.p_default, TLiqEnt_nominal, X=MediumLiq.X_default) -
      MediumLiq.specificEnthalpy_pTX(
        MediumLiq.p_default, TLiqLvg_nominal, X=MediumLiq.X_default) +
      mLiq_flow_nominal - MediumLiq.specificEnthalpy_pTX(
      MediumLiq.p_default, TLiqLvg_nominal, X=MediumLiq.X_default)) *
      mLiq_flow_nominal - MediumLiq.specificEnthalpy_pTX(
      specificEnthalpy_pTX(
        MediumLiq.p_default, TLiqLvg_nominal, X=MediumLiq.X_default),
      MediumLiq.p_default,
      TLiqLvg_nominal,
      X=MediumLiq.X_default)
    "Transmitted heat flow rate at design conditions";
  Buildings.Controls.OBC.CDL.Interfaces.BooleanInput u1PumHeaWatPri_actual[nEnaHeaWat +
    nEnaHeaWat](each start=false)
    if have_heaWat and not (have_valInlIso or have_valOutIso);

  encapsulated function switchInteger
    "Switch two Integer arguments"
    input Integer x1 "First argument";
    input Integer x2 "Second argument";
    output Integer y1 "Output = x2";
    output Integer y2 "Output = x1";
  algorithm
    y1 := x2;
    y2 := x1;
  end switchInteger;

  pure function pureReadLine
    "Read a line of text from a file and return it in a string"
    extends Modelica.Icons.Function;
    input String fileName "Name of the file that shall be read";
    input Integer lineNumber(min=1) "Number of line to read";
    output String string "Line of text";
    output Boolean endOfFile
      "If true, end-of-file was reached when trying to read line";
    external "C" string = ModelicaInternal_readLine(
      fileName,
      lineNumber,
      endOfFile)
      annotation(IncludeDirectory="modelica://Modelica/Resources/C-Sources",
        Include="#include \"ModelicaInternal.h\"",
        Library="ModelicaExternalC");
  annotation(defaultComponentName="rea");
  end pureReadLine;
equation
  y = if initial() then yIni else u;
  connect(heaFloSen.Q_flow, Q_flow_internal) "Needed because of conditional input";
end Miscellaneous;
