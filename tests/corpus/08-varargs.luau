-- varargs and select
local function sum(...)
  local n = select("#", ...)
  local t = 0
  for i = 1, n do t = t + (select(i, ...) or 0) end
  return t, n
end
print(sum(1, 2, 3, 4))

local function pack2(...)
  local args = { ... }
  return #args, args[1], args[#args]
end
print(pack2("a", nil, "c"))

local function forward(...)
  return sum(...)
end
print(forward(5, 5))

local function mixed(a, b, ...)
  return a, b, select("#", ...)
end
print(mixed(1, 2, 3, 4, 5))

print(select(2, "x", "y", "z"))
print((function(...) return select("#", ...) end)())

local t = { sum(1, 2) }
print(#t, t[1], t[2])
