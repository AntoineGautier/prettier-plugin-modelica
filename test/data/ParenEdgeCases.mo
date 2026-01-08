within;
model ParenEdgeCases
  // Edge case 1: Nested if in parenthesized expression with long comparison operator RHS
  parameter Real test1 =
    if outer_cond
    then (if inner_var ==
      VeryLongPackageName.SubModule.AnotherModule.TypeDefinition.EnumValue
      then result_when_true else result_when_false)
    else default_result;
  // Edge case 2: Multiple binary operations inside parenthesized nested if
  parameter Real test2 =
    if have_feature
    then (if param1 == Pkg.Type.Value
      then base * factor + offset else base / divisor - adjustment)
    else fallback;
  // Edge case 3: Nested parenthesized expressions with ifs
  parameter Real test3 =
    if cond1
    then ((if cond2 == Value.A then x else y) + (if cond3 == Value.B
      then a else b))
    else default;
  // Edge case 4: If in else branch with parenthesized nested if
  parameter Real test4 =
    if first_condition
    then first_result
    else (if second_condition == Some.Long.Package.Name.Type.Value
      then second_result else final_fallback);
  // Edge case 5: Arithmetic with parenthesized if containing comparison
  parameter Real test5 =
    if enabled
    then coefficient * (if mode == System.Config.Mode.Advanced
      then advanced_multiplier else basic_multiplier)
    else zero;
  // Edge case 6: Function call with parenthesized if argument
  parameter Real test6 =
    if use_complex
    then computeValue(
      param1=base_value,
      param2=(if variant == Library.Types.Variant.SpecialCase
        then special_param else normal_param))
    else simple_value;
  // Edge case 7: Logical operators with parenthesized nested if
  parameter Boolean test7 =
    if condition_a
      and (if condition_b == Enum.Type.Value then condition_c else condition_d)
    then true else false;
  // Edge case 8: Array subscript with parenthesized nested if
  parameter Real test8 =
    if has_array
    then array_data[(if index_type == System.IndexType.Primary
      then primary_index else secondary_index)]
    else default;
  // Edge case 9: Deeply nested ifs with multiple parenthesized levels
  parameter Real test9 =
    if level1
    then (if level2
      then (if level3 == Deep.Package.Path.To.Value
        then (if level4 then deepest_result else level4_fallback)
        else level3_fallback)
      else level2_fallback)
    else level1_fallback;
  // Edge case 10: Comparison in parenthesized if with short-circuit logical ops
  parameter Real test10 =
    if outer
    then (if flag and variable == LongPackage.Module.Type.EnumValue or
      other_flag
      then result_a else result_b)
    else result_c;
end ParenEdgeCases;
