import { ZkClient } from "@graphland/zkteco";

const zk = new ZkClient({
  ip: "192.168.0.153",
  port: 6523,
  timeout: 10000,
  udpPort: 4000,
});

try {
  await zk.connect();

  //   const info = await zk.getInfo();
  //   console.log("Device info:", info);

  //   const users = await zk.getUsers();
  //   console.log(`Users (${users.length}):`, users);

  //   const user = await zk.getUserById("1");
  //   console.log("User by id:", user);

  // Example: create / update / delete
  //   await zk.createUser({ userId: "5011", name: "Rayhan" });

  const user = await zk.getUserById("5011");
  console.log("User by id:", user);
  // await zk.updateUser("99", { name: "Updated Name" });
  // await zk.deleteUser("99");

  const records = await zk.getUserAttendances("5011", {
    from: new Date("2026-06-01"),
    to: new Date("2026-06-25"),
  });

  console.log(records);

  await zk.disconnect();
} catch (error) {
  console.error(error);
}

// 4370
// 6523
