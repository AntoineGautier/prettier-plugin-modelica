package P
  function abs
    input Real x;
    output Real y;
  algorithm
    y := 42;
  end abs;

  function f
    input Real x;
    output Real y;
    .Modelica.Units.SI.Voltage v;
    .Modelica.Units.SI.Voltage w[2] = {.Modelica.Constants.pi, a.b[1].c};
  algorithm
    y := .abs(x) + .Modelica.Math.sin(x[1]) + a.b[2].c;
    .Modelica.Utilities.Streams.print("x");
  end f;

  model M
    extends .Modelica.Icons.Example;
    .Modelica.Blocks.Sources.Constant c(k=.Modelica.Constants.e);
  equation
    connect(.a.b, c.y);
  end M;
end P;
