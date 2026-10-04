-- block scoping: declarations inside if/do/while/for/repeat must not escape
if true then
  local a = 1
end
print("a", a)
if false then
  local b = 2
else
  local c = 3
end
print("b", b, "c", c)
if false then local d = 4 elseif true then local e = 5 end
print("d", d, "e", e)
if true then
  local function f() return 7 end
  print("inside", f())
end
print("f", f)

do
  local q = 1
end
print("q", q)
for i = 1, 2 do
  local z = i
end
print("z", z)
while false do
  local w = 1
end
print("w", w)
repeat
  local r = 1
until true
print("r", r)

local function outer()
  if true then local g = 9 end
  return g
end
print("g", outer())

local h = 0
if h == 0 then
  local h2 = 1
  h = h2 + h
end
print("h", h)

-- captures inside a branch/loop that never runs, then a read afterwards
local cap = 5
for _ = 1, 0 do
  local fn = function() return cap end
end
print("cap", cap)
if false then
  local fn2 = function() return cap end
end
print("cap2", cap)
