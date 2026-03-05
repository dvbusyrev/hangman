package Class;
import Interface.*;
import java.util.HashSet;
import java.util.Scanner;

public class ManImpl implements Man {
    private int mistakes;
    private boolean isHangedUp;
    private HashSet<String> pickedLetters;
    private boolean isWon;

    public ManImpl() {
        mistakes = 0;
        isHangedUp = false;
        isWon = false;
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
            return letter.toUpperCase();
        } else {
            pickLetter();
        }
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
    public void addLetter(String letter) {
        pickedLetters.add(letter);
    }
}
