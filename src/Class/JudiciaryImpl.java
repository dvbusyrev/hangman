package Class;
import Interface.*;

import java.util.HashSet;
import java.util.HashMap;
import java.io.BufferedReader;
import java.io.FileReader;
import java.io.FileNotFoundException;
import java.io.IOException;

public class JudiciaryImpl implements Judiciary {
    private HashMap<String, HashSet<String>> glossary;
    private HashMap<String, HashMap<Integer, Integer>> rules;
    private String word;

    public JudiciaryImpl() {
        glossaryInit();
        rulesInit();
    }

    private void rulesInit() {
        rules = new HashMap<>();
        try (BufferedReader reader = new BufferedReader(new FileReader("RULES.txt"))) {
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

    private void glossaryInit() {
        glossary = new HashMap<>();
        try (BufferedReader reader = new BufferedReader(new FileReader("GLOSSARY.txt"))) {
            String line;
            String topic;
            HashSet<String> wordSet = null;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("#")) {
                    topic = line.replace("#", "");
                    wordSet = new HashSet<>();
                    glossary.put(topic.toUpperCase(), wordSet);
                } else if (!line.equals("")) {
                    wordSet.add(line.toUpperCase());
                }
            }
        } catch (FileNotFoundException e) {
            e.printStackTrace();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    public void printGlossary() {
        for (HashMap.Entry set: glossary.entrySet()) {
            System.out.println(set);
        }
     }

     public void printRules() {
         for (HashMap.Entry set: rules.entrySet()) {
             System.out.println(set);
         }
     }
    @Override
    public HashMap<String, String> getGameModes() {
        HashMap<String, String> gameModes = new HashMap<>();
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
    public boolean pickWord(String topic) {
        return true;
    };

    @Override
    public void isCorrectLetter(String letter, Man man) {
        if (word.contains(letter)) {
            man.addLetter(letter);
        } else {
            man.addMiss();
        }
    }

    @Override
    public int getWordLength() {
        if (word != null) {
            return word.length();
        }
        return 0;
    }

    @Override
    public String getWordWithLetters(Man man) {
        HashSet<String> pickedLetters = man.getPickedLetters();
        for (String letter : pickedLetters) {

        }
        return new String();
    }

    @Override
    public boolean isCorrectWord(Man man){return true;};

    @Override
    public String getVerdict(String gameMode, Man man) {
        HashMap<Integer, Integer> rule = rules.get(gameMode);
        int verdictNumber = rule.get(man.getMistakes());
        return String.format("1,%d", verdictNumber);
    };

}
