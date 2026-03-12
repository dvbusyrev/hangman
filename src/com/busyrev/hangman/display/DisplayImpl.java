package com.busyrev.hangman.display;
import java.io.IOException;
import java.io.FileNotFoundException;
import java.io.BufferedReader;
import java.io.FileReader;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.ArrayList;
import java.util.List;

public class DisplayImpl implements Display {
    private LinkedHashMap<Integer, ArrayList<String>> menuGui = new LinkedHashMap<>();
    private LinkedHashMap<Integer, ArrayList<String>> systemGui = new LinkedHashMap<>();
    private LinkedHashMap<Integer, ArrayList<String>> manGui = new LinkedHashMap<>();
    private final static HashSet<String> GUI_TYPES = new HashSet<>(List.of("MENU", "SYSTEM", "MAN"));
    private final static int GUI_LENGTH = 37;
    private String language;

    @Override
    public void displayInput() {
        System.out.print(">");
    }

    private void clear() {
        try {
            String os = System.getProperty("os.name").toLowerCase();
            ProcessBuilder pb;
            if (os.contains("win")) {
                // Windows
                pb = new ProcessBuilder("cmd", "/c", "cls");
            } else {
                // Unix/Linux/Mac
                pb = new ProcessBuilder("clear");
            }
            Process process = pb.inheritIO().start();
            process.waitFor();
        } catch (Exception e) {
            e.printStackTrace();
        }
        System.out.println();
    }

    @Override
    public void init(String language) {
        this.language = language;
        try (BufferedReader reader = new BufferedReader(new FileReader("src/resources/" + this.language + "/GUI.txt"))) {
            String line;
            int number = 0;
            String guiType = "";

            while ((line = reader.readLine()) != null) {
                if (line.contains("//")) {
                    int index = line.indexOf("//");
                    line = line.substring(0, index);
                }
                if (line.isEmpty()) {
                    continue;
                }
                if (line.startsWith("#") && GUI_TYPES.contains(line.replace("#", ""))) {
                    guiType = line.replace("#", "");
                    continue;
                }
                if (line.strip().matches("\\d+")) {
                    number = Integer.valueOf(line.strip());
                    continue;
                }
                switch (guiType) {
                    case "MENU" -> {
                        ArrayList<String> picture;
                        if (menuGui.containsKey(number)) {
                            picture = menuGui.get(number);
                        } else {
                            picture = new ArrayList<>();
                            menuGui.put(number, picture);
                        }
                        picture.add(line);
                    }
                    case "SYSTEM" -> {
                        ArrayList<String> picture;
                        if (systemGui.containsKey(number)) {
                            picture = systemGui.get(number);
                        } else {
                            picture = new ArrayList<>();
                            systemGui.put(number, picture);
                        }
                        picture.add(line);
                    }
                    case "MAN" -> {
                        ArrayList<String> picture;
                        if (manGui.containsKey(number)) {
                            picture = manGui.get(number);
                        } else {
                            picture = new ArrayList<>();
                            manGui.put(number, picture);
                        }
                        picture.add(line);
                    }
                }
            }
        } catch (FileNotFoundException e) {
            e.printStackTrace();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    @Override
    public void displayChooseAction() {
        clear();
        display(new DrawInstruction("MENU", 0));
    }

    @Override
    public void displayIncorrectInput() {
        clear();
        display(new DrawInstruction("MENU", 1));
    }

    @Override
    public void displayExitGame() {
        clear();
        display(new DrawInstruction("MENU", 2));
    }

    @Override
    public void displayChooseGameMode() {
        clear();
        display(new DrawInstruction("SYSTEM", 5));
    }

    @Override
    public void displayChooseTopic() {
        clear();
        display(new DrawInstruction("SYSTEM", 6));
    }

    private ArrayList<String> chooseGui(DrawInstruction instr) {
        switch (instr.type()) {
            case "MENU" -> {
                return menuGui.get(instr.number());
            }
            case "SYSTEM" -> {
                return systemGui.get(instr.number());
            }
            case "MAN" -> {
                return manGui.get(instr.number());
            }
        }
        return null;
    }

    private void display(DrawInstruction instr) {
        ArrayList<String> gui = chooseGui(instr);
        for (String line : gui) {
            if (line != null) {
                System.out.println(line);
            }
        }
    }

    @Override
    public void displayMan(DrawInstruction instr, int mistakes, String guessedWord, HashSet<String> manPickedLetters) {
        clear();
        drawUpperGuiPart(mistakes);
        display(instr);
        drawWord(guessedWord);
        drawKeyboard(manPickedLetters);
    }

    private void drawUpperGuiPart(int mistakes) {
        display(new DrawInstruction("SYSTEM", 0));
        mistakesLine(mistakes);
    }

    public void drawKeyboard(HashSet<String> pickedLetters) {
        ArrayList<String> picture = chooseGui(new DrawInstruction("SYSTEM", 1));
        for (String line : picture) {
            if (line != null) {
                for (String letter : pickedLetters) {
                    line = line.replace(letter, "_");
                }
                System.out.println(line);
            }
        }
    }

    @Override
    public void displayGameWin(DrawInstruction instr, int mistakes, String guessedWord) {
        clear();
        drawUpperGuiPart(mistakes);
        display(instr);
        drawWord(guessedWord);
        display(new DrawInstruction("SYSTEM", 2));
    }

    @Override
    public void displayGameOver(int mistakes, String correctWord) {
        clear();
        drawUpperGuiPart(mistakes);
        gameOverMan();
        drawWord(correctWord);
        gameOverTitle();
    }

    private void gameOverTitle() {
        display(new DrawInstruction("SYSTEM", 3));
    }

    private void gameOverMan() {
        display(new DrawInstruction("SYSTEM", 4));
    }

    private void drawWord(String word) {
        word = addSpacesBetween(word);
        StringBuilder guiLine = new StringBuilder("║");
        int guiPartA = GUI_LENGTH / 2;
        int guiPartB = GUI_LENGTH - guiPartA;
        int wordPartA = word.length() / 2;
        int wordPartB = word.length() - wordPartA;

        for (int i = 0; i < guiPartA - wordPartA; i++) {
            guiLine.append(" ");
        }
        guiLine.append(word);
        for (int i = 0; i < guiPartB - wordPartB; i++) {
            guiLine.append(" ");
        }
        guiLine.append("║");
        System.out.println(guiLine);
    }

    private void mistakesLine(int mistakes) {
        StringBuilder guiLine = new StringBuilder("║");
        String mistakeWord = "ERRORS";
        if (language.equals("RUSSIAN")) {
            mistakeWord = "ОШИБКИ";
        }

        String mistakePart = String.format(" %s: %d", mistakeWord, mistakes);
        guiLine.append(mistakePart);

        for (int i = 0; i < GUI_LENGTH - mistakePart.length(); i++) {
            guiLine.append(" ");
        }

        guiLine.append("║");
        System.out.println(guiLine);
    }

    @Override
    public void displayChooseLanguage() {
        clear();
        System.out.println("CHOOSE LANGUAGE // ВЫБЕРЕТЕ ЯЗЫК");
        System.out.println();
        System.out.println("1. ENGLISH // АНГЛИЙСКИЙ");
        System.out.println("2. RUSSIAN // РУССКИЙ");
        System.out.println();
        System.out.println("INPUT 1 OR 2 // ВВЕДИТЕ 1 ИЛИ 2");
        System.out.println();
    }

    @Override
    public void displayInterruption() {
        System.out.println();
        System.out.println("Ввод прерван (Ctrl+C). Завершение игры...");
    }

    private String addSpacesBetween(String guessedWord) {
        if (guessedWord == null || guessedWord.isEmpty()) {
            return guessedWord;
        }
        StringBuilder result = new StringBuilder();
        for (int i = 0; i < guessedWord.length(); i++) {
            result.append(guessedWord.charAt(i));
            if (i < guessedWord.length() - 1) {
                result.append(' ');
            }
        }
        return result.toString();
    }
}

