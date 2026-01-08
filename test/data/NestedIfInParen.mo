within;
model NestedIfInParenTest
  // Test case 1: Nested if with comparison inside parenthesized expression in then clause
  parameter Real x =
    if condition1
    then (if variable == SomePackage.SomeModule.SomeType.SomeValue
      then result1 else result2)
    else fallback;
  // Test case 2: Multiple levels of nesting
  parameter Real y =
    if outer_condition
    then (if middle_condition
      then (if inner_var == VeryLong.Package.Name.With.Many.Dots.Value
        then innermost_result else inner_fallback)
      else middle_fallback)
    else outer_fallback;
  // Test case 3: Arithmetic operations inside parenthesized nested if
  parameter Real z =
    if have_feature
    then (if feature_type == System.Configuration.Types.FeatureA
      then base_value * scaling_factor else base_value / scaling_factor)
    else default_value;
end NestedIfInParenTest;
