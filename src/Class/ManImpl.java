package Class;
import Interface.*;
import java.util.HashSet;
import java.util.NoSuchElementException;
import java.util.Scanner;

public class ManImpl implements Man {
    private int mistakes;
    private boolean isHangedUp;
    private HashSet<String> correctPickedLetters;
    private HashSet<String> pickedLetters;
    private boolean isWon;

    public ManImpl() {
        mistakes = 0;
        isHangedUp = false;
        isWon = false;
        correctPickedLetters = new HashSet<>();
        pickedLetters = new HashSet<>();
    }

    @Override
    public String pickLetter(Display console, Scanner scanner, String language) {
        Display.promt();
        String letter = "";
        try {
            letter = scanner.nextLine();
        } catch (NoSuchElementException e) {
            console.drawInterruption();
            System.exit(0);  // корректное завершение
        }
        String languageLetterSet = "[a-zA-Z]";
        if (language.equals("RUSSIAN")) {
            languageLetterSet = "[а-яА-Я]";
        }
        if (letter != null
                && letter.length() == 1
                && letter.matches(languageLetterSet)
                && !pickedLetters.contains(letter.toUpperCase())) {
            pickedLetters.add(letter.toUpperCase());
            return letter.toUpperCase();
        }
        return pickLetter(console, scanner, language);
    }

    @Override
    public void addMistake() {
        mistakes++;
    }

    @Override
    public boolean isHangedUp() {
        return isHangedUp;
    }

    @Override
    public boolean isWon() {
        return isWon;
    }

    @Override
    public void hangUp() {
        isHangedUp = true;
    }

    @Override
    public void win() {
        isWon = true;
    }

    @Override
    public HashSet<String> getPickedLetters() {
        return pickedLetters;
    }

    @Override
    public int getMistakes() {
        return mistakes;
    }

    @Override
    public void addCorrectLetter(String letter) {
        correctPickedLetters.add(letter);
    }

}
