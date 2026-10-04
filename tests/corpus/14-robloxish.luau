-- Roblox-flavoured Luau: services as globals, instances, events
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local part = Instance.new("Part")
part.Name = "DarkPart"
part.Size = Vector3.new(1, 2, 3)
part.Position = Vector3.new(0, 10, 0)
part.Anchored = true
part.BrickColor = BrickColor.new("Really red")
part.Parent = workspace

local counter = 0
local connection = RunService.Heartbeat:Connect(function(dt)
  counter = counter + dt
end)

local function onPlayerAdded(player)
  print("Player added:", player.Name, player.UserId)
  local leaderstats = Instance.new("Folder")
  leaderstats.Name = "leaderstats"
  leaderstats.Parent = player
  local cash = Instance.new("IntValue")
  cash.Name = "Cash"
  cash.Value = 100
  cash.Parent = leaderstats
end

for _, player in ipairs(Players:GetPlayers()) do
  onPlayerAdded(player)
end

local tweenInfo = TweenInfo.new(1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
print(part.Name, part.Size.X, tweenInfo.Time)

task.wait(0.1)
task.spawn(function()
  print("spawned", counter >= 0)
end)

local cframe = CFrame.new(0, 5, 0) * CFrame.Angles(0, math.rad(90), 0)
print(cframe.Position.Y > 4.9)

local ray = RaycastParams.new()
ray.FilterType = Enum.RaycastFilterType.Blacklist
print(ray.FilterType.Name)

if connection then connection:Disconnect() end
print("robloxish done")
