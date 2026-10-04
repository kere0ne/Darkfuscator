-- metatables, methods, self
local Animal = {}
Animal.__index = Animal

function Animal.new(name, sound)
  local o = setmetatable({ name = name, sound = sound }, Animal)
  return o
end

function Animal:speak()
  return self.name .. " says " .. self.sound
end

function Animal:__tostring()
  return "<Animal " .. self.name .. ">"
end

local dog = Animal.new("Rex", "woof")
local cat = Animal.new("Tom", "meow")
print(dog:speak())
print(cat:speak())
print(tostring(dog))

local Dog = setmetatable({}, { __index = Animal })
Dog.__index = Dog
function Dog.new(name) 
  local o = Animal.new(name, "woof")
  return setmetatable(o, Dog)
end
function Dog:fetch() return self.name .. " fetches" end
local d = Dog.new("Buddy")
print(d:speak(), d:fetch())

local counter = setmetatable({}, {
  __index = function(t, k) return k * 2 end,
  __call = function(self, x) return x + 1 end,
  __add = function(a, b) return (a.n or 0) + (b.n or 0) end,
  __len = function() return 7 end,
  __eq = function() return true end,
  __concat = function(a, b) return "concat!" end,
})
print(counter[5], counter(1), #counter)

local Vec = {}
Vec.__index = Vec
function Vec.new(x, y) return setmetatable({ x = x, y = y }, Vec) end
function Vec.__add(a, b) return Vec.new(a.x + b.x, a.y + b.y) end
function Vec:__tostring() return "(" .. self.x .. "," .. self.y .. ")" end
local v = Vec.new(1, 2) + Vec.new(3, 4)
print(tostring(v))

print(("%s-%s"):format("a", "b"))
print(("abc"):sub(2, 3))
