package Class;
import Interface.*;
import java.util.HashSet;
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
    public String pickLetter() {
        Display.promt();
        Scanner scanner = new Scanner(System.in);
        String letter = scanner.nextLine();
        if (letter != null
                && letter.length() == 1
                && letter.matches("[a-zA-Z]+")
                && !pickedLetters.contains(letter)) {
            pickedLetters.add(letter.toUpperCase());
            return letter.toUpperCase();
        }
        pickLetter();
        return null;
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
