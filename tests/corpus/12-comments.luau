-- leading comment
--[[ block comment
     spanning lines ]]
local a = 1 -- trailing
--[[ another ]] local b = 2
local s = "not a -- comment"
local s2 = [[nor -- this]]
--[==[ level 3 ]==]
local t = { --[[inline]] 1, 2 }
print(a, b, s, s2, t[1], t[2])
-- final comment
