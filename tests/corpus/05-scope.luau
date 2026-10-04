-- scoping torture test
local x = "outer"
do
  local x = "inner"
  print(x)
end
print(x)

local shadowed = 1
local function useShadow()
  local shadowed = 2
  return shadowed
end
print(shadowed, useShadow())

-- local x = x refers to the outer/global x
local v = 10
do
  local v = v * 2   -- inner v = 20? no: refers to outer v (10) -> 20
  print("shadow-init", v)
end

local funcs = {}
for i = 1, 3 do
  local captured = i
  funcs[i] = function() return captured end
end
print(funcs[1](), funcs[2](), funcs[3]())

for i = 1, 3 do
  local twice = i * 2
  if twice == 4 then print("found4") end
end

local function recurse(n)
  if n <= 0 then return 0 end
  return n + recurse(n - 1)
end
print("recurse", recurse(5))

local a, b
local function swapper()
  a, b = 1, 2
  return a, b
end
print(swapper())

local i = 0
repeat
  local step = i
  i = i + 1
until step >= 2
print("repeat-scope", i)

local fwd
function fwd() return "forward" end
print(fwd())

local obj = {}
obj.value = 1
function obj:getValue() return self.value end
function obj.setValue(o, v) o.value = v end
obj.setValue(obj, 9)
print(obj:getValue())

local self = "shadowed self"
print(self)
