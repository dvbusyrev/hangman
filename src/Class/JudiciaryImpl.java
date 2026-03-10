package Class;
import Interface.*;

import java.util.Arrays;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.io.BufferedReader;
import java.io.FileReader;
import java.io.FileNotFoundException;
import java.io.IOException;

public class JudiciaryImpl implements Judiciary {
    private HashMap<String, ArrayList<String>> glossary;
    private LinkedHashMap<String, HashMap<Integer, Integer>> rules;
    private String word;

    public JudiciaryImpl(String language) {
        glossaryInit(language);
        rulesInit(language);
    }

    private void rulesInit(String language) {
        rules = new LinkedHashMap<>();
        try (BufferedReader reader = new BufferedReader(new FileReader("src/resources/" + language + "/RULES.txt"))) {
            String line;
            String mode;
            HashMap<Integer, Integer> transitions = null;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("#")) {
                    mode = line.replace("#", "");
                    transitions = new HashMap<>();
                    rules.put(mode.toUpperCase(), transitions);
                } else if (!line.equals("")) {
                    String[] numbers = line.split("->");
                    transitions.put(Integer.valueOf(numbers[0]), Integer.valueOf(numbers[1]));
                }
            }
        } catch (FileNotFoundException e) {
            e.printStackTrace();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private void glossaryInit(String language) {
        glossary = new HashMap<>();
        try (BufferedReader reader = new BufferedReader(new FileReader("src/resources/" + language + "/GLOSSARY.txt"))) {
            String line;
            String topic;
            ArrayList<String> wordList = null;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("#")) {
                    topic = line.replace("#", "");
                    wordList = new ArrayList<>();
                    glossary.put(topic.toUpperCase(), wordList);
                } else if (!line.isEmpty()) {
                    wordList.add(line.toUpperCase());
                }
            }
        } catch (FileNotFoundException e) {
            e.printStackTrace();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    @Override
    public LinkedHashMap<String, String> getGameModes() {
        LinkedHashMap<String, String> gameModes = new LinkedHashMap<>();
        int i = 1;
        for (String gameMode : rules.keySet()) {
            gameModes.put(String.valueOf(i++), gameMode);
        }
        return gameModes;
    }

    @Override
    public HashMap<String, String> getTopics() {
        HashMap<String, String> topics = new HashMap<>();
        int i = 1;
        for (String topic : glossary.keySet()) {
            topics.put(String.valueOf(i++), topic);
        }
        return topics;
    }

    @Override
    public void pickWord(String topic) {
        ArrayList<String> wordArray = glossary.get(topic);
        int wordIndex = (int) (Math.random() * wordArray.size());
        word = wordArray.get(wordIndex);
    }

    @Override
    public boolean checkLetter(String letter) {
        return word.contains(letter);
    }

    @Override
    public boolean checkGuessedWord(HashSet<String> pickedLetters) {
        return getGuessedWord(pickedLetters).equals(word);
    }

    @Override
    public void applyVerdict(String gameMode, String letter, Man man, Hangman hangman) {
        if (checkLetter(letter)) {
            if (checkGuessedWord(man.getPickedLetters())) {
                man.win();
            }
        } else {
            hangman.applySanction(man);
            boolean mustHangUp = !rules.get(gameMode).containsKey(man.getMistakes());
            if (mustHangUp) {
                hangman.hangUp(man);
            }
        }
    }

    @Override
    public DrawInstruction getManDrawInstruction(String gameMode, int mistakes) {
        HashMap<Integer, Integer> rule = rules.get(gameMode);
        int instructionNumber = rule.get(mistakes);
        return new DrawInstruction("MAN", instructionNumber);
    }

    @Override
    public String getGuessedWord(HashSet<String> letters) {
        char[] guessedWord = new char[word.length()];
        Arrays.fill(guessedWord, '_');
        for (String letter : letters) {
            for (int i = 0; i < word.length(); i++) {
                if (word.charAt(i) == letter.charAt(0)) {
                    guessedWord[i] = letter.charAt(0);
                }
            }
        }
        return String.valueOf(guessedWord);
    }

    public String getWord() {
        return word;
    }
}
