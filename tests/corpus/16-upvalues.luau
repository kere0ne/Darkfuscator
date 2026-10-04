-- upvalue writes where the source register differs from the upvalue index
local x, y = 0, 0
local function setY()
  local t = 5
  y = t
end
setY()
print("setY", x, y)

local a1, b1, c1 = 0, 0, 0
local function setB()
  local v = 7
  b1 = v
end
setB()
print("setB", a1, b1, c1)

local n = 1
local function bump()
  n = n + 41
end
bump()
bump()
print("bump", n)

local p, q = 1, 2
local function swap()
  local t = p
  p = q
  q = t
end
swap()
print("swap", p, q)

local counter = 0
local function makeAdder(by)
  return function(v)
    counter = counter + 1
    return v + by
  end
end
local add10 = makeAdder(10)
local add100 = makeAdder(100)
print("add", add10(1), add100(1), add10(2), "calls", counter)

local shared = {}
local function push(v)
  shared[#shared + 1] = v
end
for i = 1, 4 do
  push(i * i)
end
print("shared", table.concat(shared, ","))

local outer = 0
do
  local mid = 0
  local function inner()
    mid = mid + 1
    outer = mid * 3
  end
  inner()
  inner()
end
print("nested", outer)

local ra, rb = "a", "b"
local function reassign()
  local tmp = ra
  ra = rb .. "!"
  rb = tmp .. "?"
end
reassign()
print("reassign", ra, rb)
