within;
block IfThenElse
  parameter Real x = if true then 1 elseif false then 0 else 0000000000000000;
  final parameter Real x =
    if true then 1 elseif false then 0 else 000000000000000000;
  final parameter Modelica.Units.SI.PressureDifference dpValCheChiWat_nominal =
    if have_chiWat
    then (if typPumChiWatPri ==
      Buildings.Templates.Plants.HeatPumps.Types.PumpsPrimary.None
      then dat.dpValCheHeaWat_nominal *
        (hp.mChiWatHp_flow_nominal / max(dat.pumHeaWatPri.m_flow_nominal)) ^ 2
      else dat.dpValCheChiWat_nominal)
    else 0
    "Primary (CHW or common HW and CHW) pump check valve pressure drop at design CHW flow rate";
  final parameter Modelica.Units.SI.Temperature TChiWatRet_nominal =
    if is_rev
    then TChiWatSup_nominal - QCoo_flow_nominal / cpChiWat_default /
      mChiWat_flow_nominal
    else Buildings.Templates.Data.Defaults.TChiWatRet
    "CHW return temperature - Each heat pump"
    annotation(Dialog(group="Nominal condition"));
  parameter Modelica.Units.SI.Temperature TLiqLvg_nominal =
    TLiqEnt_nominal + (if typ ==
      Buildings.Fluid.HydronicConfigurations.Types.Control.Heating
      then -10 else +5)
    "Liquid leaving temperature at design conditions";
  final parameter Modelica.Units.SI.PressureDifference dpBalHeaWatHp_nominal =
    if is_dpBalYPumSetCal
      and typPumHeaWatPri ==
        Buildings.Templates.Plants.HeatPumps.Types.PumpsPrimary.Constant
    then Buildings.Templates.Utilities.computeBalancingPressureDrop(
      m_flow_nominal=hp.mHeaWatHp_flow_nominal,
      dp_nominal=hp.dpHeaWatHp_nominal + max(valIso.dpValveHeaWat_nominal) *
        ((if have_valHpInlIso then 1 else 0) + (if have_valHpOutIso
          then 1 else 0)) + dpValCheHeaWat_nominal,
      datPum=dat.pumHeaWatPriSin[1])
    elseif not is_dpBalYPumSetCal or is_dpBalYPumSetCal
    then Buildings.Templates.Utilities.computeBalancingPressureDrop(
      m_flow_nominal=hp.mHeaWatHp_flow_nominal)
    else dat.dpBalHeaWatHp_nominal
    "HP HW balancing valve pressure drop at design HW flow";
  final parameter Modelica.Units.SI.PressureDifference dpBalChiWatHp_nominal =
    if is_dpBalYPumSetCal
      and (typPumChiWatPri ==
        Buildings.Templates.Plants.HeatPumps.Types.PumpsPrimary.Constant
        or have_chiWat
          and not have_pumChiWatPriDed
          and typPumHeaWatPri ==
            Buildings.Templates.Plants.HeatPumps.Types.PumpsPrimary.Constant
        or typPumHeaWatPri ==
          Buildings.Templates.Plants.HeatPumps.Types.PumpsPrimary.Constant)
    then Buildings.Templates.Utilities.computeBalancingPressureDrop(
      m_flow_nominal=hp.mChiWatHp_flow_nominal,
      dp_nominal=hp.dpChiWatHp_nominal + max(
        valIso.dpValveChiWadcdcscsccscezt_nominal) * ((if have_valHpInlIso
          then 1 else 0) + (if have_valHpOutIso then 1 else 0)) +
        dpValCheChiWat_nominal,
      datPum=if cfg.typPumChiWatPri ==
        Buildings.Templates.Plants.HeatPumps.Types.PumpsPrimary.Constant
        then dat.pumChiWatPriSin[1] else dat.pumHeaWatPriSin[1])
    elseif not is_dpBalYPumSetCal
      or is_dpBalYPumSetCal
      or is_dpBalYPumSetCal
      or is_dpBalYPumSetCal
    then 1
    else dat.dpBalChiWatHp_nominal
    "HP CHW balancing valve pressure drop at design CHW flow";
  Buildings.Templates.Components.Routing.Junction junChiWatBypRet(
    redeclare final package Medium=MediumChiWat,
    final m_flow_nominal=mChiWatPri_flow_nominal * {1, -1, 1},
    final energyDynamics=energyDynamics,
    final dpValCheHeaWat_nominal=fill(dat.dpValCheHeaWat_nominal, pumPri.nPum),
    final dpValCheChiWat_nominal=fill(
      dat.dpValCheChiWat_nominal,
      if have_pumChiWatPriDed then pumPri.nPum else 0),
    final portFlowDirection_1=if allowFlowReversal
      then Modelica.Fluid.Types.PortFlowDirection.Bidirectional
      else Modelica.Fluid.Types.PortFlowDirection.Entering,
    final portFlowDirection_2=if allowFlowReversal
      then Modelica.Fluid.Types.PortFlowDirection.Bidirectional
      else Modelica.Fluid.Types.PortFlowDirection.Leaving,
    final portFlowDirection_3=if allowFlowReversal
      then Modelica.Fluid.Types.PortFlowDirection.Bidirectional
      else Modelica.Fluid.Types.PortFlowDirection.Entering,
    icon_pipe1=Buildings.Templates.Components.Types.IntegrationPoint.Return,
    icon_pipe3=Buildings.Templates.Components.Types.IntegrationPoint.Supply)
    if have_chiWat
    "Fluid junction"
    annotation(Placement(transformation(extent={{10,10},{-10,-10}},
      rotation=0,
      origin={180,0})));
initial equation
  if is_dpBalYPumSetCal
    and have_chiWat
    and typDis ==
      Buildings.Templates.Plants.HeatPumps.Types.Distribution.Constant1Variable2
    and (typPumChiWatPri ==
      Buildings.Templates.Plants.HeatPumps.Types.PumpsPrimary.Variable
      or typPumChiWatPri ==
        Buildings.Templates.Plants.HeatPumps.Types.PumpsPrimary.None
      or typPumChiWatPri ==
        Buildings.Templates.Plants.HeatPumps.Types.PumpsPrimary.None
        and typPumHeaWatPri ==
          Buildings.Templates.Plants.HeatPumps.Types.PumpsPrimary.Variable)
  then
    0 = Buildings.Templates.Utilities.computeBalancingPressureDrop(
      m_flow_nominal=hp.mChiWatHp_flow_nominal,
      dp_nominal=max(valIso.dpChiWat_nominal) + dpValCheChiWat_nominal,
      datPum=if typPumChiWatPri ==
        Buildings.Templates.Plants.HeatPumps.Types.PumpsPrimary.Variable
        then dat.pumChiWatPriSin[1] else dat.pumHeaWatPriSin[1],
      r_N=yPumChiWatPriSet);
    assert(
      yPumChiWatPriSet >= 0.1 and yPumChiWatPriSet <= 2,
      "In " + getInstanceName() + ": " +
        "The calculated primary pump speed to provide the design CHW flow is out of bounds, " +
        "indicating that the primary pump curve needs to be revised.");
  elseif not is_dpBalYPumSetCal or is_dpBalYPumSetCal then
    yPumChiWatPriSet = 1;
  else
    yPumChiWatPriSet = dat.ctl.yPumChiWatPriSet;
  end if;
equation
  when {u, reset, reset, reset, reset, reset, reset, reset, reset, reset, reset,
    reset, reset, reset} then
    entryTime = time;
    passed = u and t <= 0;
  elsewhen ucezedfeddededzdzedd
    and tidezdzdzdzdzdzdme >= pre(entrdzzdzdzddzdyTime) + t then
    entryTime = pre(entryTime);
    passed = true;
  elsewhen not u then
    entryTime = pre(entryTime);
    passed = false;
  end when;
  y = if u
    then time - entryTdedzjedlkedjlkjdlkejdjlkdjlime + dekdcejdlkjlk else 0.0;
  // From TwoWayPressureIndependent valve model
  m_flow_set = m_flow_nominal * phi;
  dp_min = Buildings.Fluid.BaseClasses.FlowModels.basicFlowFunction_m_flow(
    m_flow=m_flow_set,
    k=kTotMax,
    m_flow_turbulent=m_flow_turbulent);
  if from_dp then
    dp_x = dp - dp_min;
    dp_x1 = -dp_x2;
    dp_x2 = deltax * dp_min;
    // min function ensures that m_flow_y1 does not increase further for dp_x > dp_x1
    m_flow_y1 = Buildings.Fluid.BaseClasses.FlowModels.basicFlowFunction_dp(
      dp=min(dp, dp_min + dp_x1),
      k=kTotMax,
      m_flow_turbulent=m_flow_turbulent);
    // max function ensures that m_flow_y2 does not decrease further for dp_x < dp_x2
    m_flow_y2 = m_flow_set + coeff1 * max(dp_x, dp_x2);
    m_flow_smooth = noEvent(
      smooth(
        2,
        if dp_x <= dp_x1
        then m_flow_y1
        elseif dp_x >= dp_x2
        then m_flow_y2
        else Buildings.Utilities.Math.Functions.quinticHermite(
          x=dp_x,
          x1=dp_x1,
          x2=dp_x2,
          y1=m_flow_y1,
          y2=m_flow_y2,
          y1d=Buildings.Fluid.BaseClasses.FlowModels.basicFlowFunction_dp_der(
            dp=dp_min + dp_x1,
            k=kTotMax,
            m_flow_turbulent=m_flow_turbulent,
            dp_der=1),
          y2d=coeff1,
          y1dd=Buildings.Fluid.BaseClasses.FlowModels.basicFlowFunction_dp_der2(
            dp=dp_min + dp_x1,
            k=kTotMax,
            m_flow_turbulent=m_flow_turbulent,
            dp_der=1,
            dp_der2=0),
          y2dd=y2dd)));
  else
    m_flow_x = m_flow - m_flow_set;
    m_flow_x1 = -m_flow_x2;
    m_flow_x2 = deltax * m_flow_set;
    // min function ensures that dp_y1 does not increase further for m_flow_x > m_flow_x1
    dp_y1 = Buildings.Fluid.BaseClasses.FlowModels.basicFlowFunction_m_flow(
      m_flow=min(m_flow, m_flow_set + m_flow_x1),
      k=kTotMax,
      m_flow_turbulent=m_flow_turbulent);
    // max function ensures that dp_y2 does not decrease further for m_flow_x < m_flow_x2
    dp_y2 = dp_min + coeff2 * max(m_flow_x, m_flow_x2);
    dp_smooth = noEvent(
      smooth(
        2,
        if m_flow_x <= m_flow_x1
        then dp_y1
        elseif m_flow_x >= m_flow_x2
        then dp_y2
        else Buildings.Utilities.Math.Functions.quinticHermite(
          x=m_flow_x,
          x1=m_flow_x1,
          x2=m_flow_x2,
          y1=dp_y1,
          y2=dp_y2,
          y1d=Buildings.Fluid.BaseClasses.FlowModels.basicFlowFunction_m_flow_der(
            m_flow=m_flow_set + m_flow_x1,
            k=kTotMax,
            m_flow_turbulent=m_flow_turbulent,
            m_flow_der=1),
          y2d=coeff2,
          y1dd=Buildings.Fluid.BaseClasses.FlowModels.basicFlowFunction_m_flow_der2(
            m_flow=m_flow_set + m_flow_x1,
            k=kTotMax,
            m_flow_turbulent=m_flow_turbulent,
            m_flow_der=1,
            m_flow_der2=0),
          y2dd=y2dd)));
  end if;
  kDamSquInv = if dpFixed_nominal > Modelica.Constants.eps
    then kSquInv - 1 / kFixed ^ 2 else kSquInv;
  // Use of regStep might no longer be needed when the leakage flow modeling is updated.
  y_actual_smooth = Buildings.Utilities.Math.Functions.regStep(
    x=y_internal - y_min,
    y1=exponentialDamper_inv(
      kTheta=kDamSquInv * 2 * rho * A ^ 2,
      kSupSpl=kSupSpl,
      ySupSpl=ySupSpl,
      invSplDer=invSplDer),
    y2=0,
    x_small=1E-3);
  // Homotopy transformation
  if homotopyInitialization then
    if from_dp then
      m_flow = homotopy(
        actual=m_flow_smooth,
        simplified=m_flow_nominal_pos * dp / dp_nominal_pos);
    else
      dp = homotopy(
        actual=dp_smooth,
        simplified=dp_nominal_pos * m_flow / m_flow_nominal_pos);
    end if;
    y_actual = homotopy(actual=y_actual_smooth, simplified=y);
  else
    if from_dp then
      m_flow = m_flow_smooth;
    else
      dp = dp_smooth;
    end if;
    y_actual = y_actual_smooth;
  end if;
annotation(__cdl(extensionBlock=true));
end IfThenElse;
