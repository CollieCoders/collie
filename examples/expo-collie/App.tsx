import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet, View, Text } from "react-native";
import Hello from "./components/Hello.collie";

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <Hello name="Expo" Container={View} Label={Text} />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff"
  }
});
